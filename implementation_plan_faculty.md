# Fix: Faculty Verification Queue — Two Root-Cause Bugs

## Problem Statement

Two bugs in the faculty verification workflow:

1. **Faculty upload doesn't appear in Pending Verifications.** A user who uploads a faculty schedule never shows up in the admin's pending queue.
2. **Rejected faculty stays in the queue.** After admin rejects a verification, the user remains listed as "Pending."

## Root Cause Analysis

### Bug 1: Pending list is empty after faculty upload

The `AdminPendingVerificationsView` query requires **all three** conditions:

```python
user_type='faculty', is_verified=False, id__in=faculty_with_schedule_ids
```

**The problem:** The `UploadFacultyCORView` does NOT require the user to have `user_type='faculty'`. Any user can upload via `/upload-cor/faculty/`. A user who registered as a `student` (the default `user_type`) and then uploaded through the faculty upload endpoint creates a `Schedule(upload_type='faculty')` — but their `user_type` is still `'student'`. They never match the `user_type='faculty'` filter in the pending verifications query.

Similarly, the admin notification trigger in `extraction_manager.py` also checks `job.upload_type == 'faculty'` but doesn't consider the user's `user_type`, so the notification may fire but the user is invisible in the pending queue.

**The fix:** The pending verifications query should be based on **Schedule upload_type**, not the User's `user_type`. Any user who uploads a faculty schedule and is unverified should appear in the pending queue — regardless of what `user_type` they registered with. When the admin approves, the system should also set `user_type='faculty'` if it isn't already.

### Bug 2: Rejected faculty stays in the pending queue

The reject endpoint (`AdminPendingVerificationRejectView`) does NOT change any state on the User model — it only writes an audit log and sends a notification. Since `is_verified` remains `False` and the schedule still exists, the user still matches the pending query and reappears on the next fetch.

**The fix:** Add a `verification_status` field to track `'pending'` / `'approved'` / `'rejected'` states instead of just a boolean. OR — simpler approach: add a `verification_rejected` boolean field and filter rejected users out of the pending queue. Even simpler: **delete their faculty schedule on rejection** so they no longer match the Schedule subquery, and the user can re-upload if they want.

> [!IMPORTANT]
> **Chosen approach for rejection:** We'll add a lightweight `faculty_verification_status` field to the User model: `'none'` (default), `'pending'`, `'approved'`, `'rejected'`. This cleanly separates the three states and allows rejected users to re-upload (which resets them to `'pending'`). The `is_verified` boolean is kept as-is and set to `True` only when status transitions to `'approved'`.

## Proposed Changes

### Backend Model

#### [MODIFY] [models.py](file:///home/sheer/Desktop/SchedScan/backend/api/models.py)

Add `faculty_verification_status` field to the User model:

```python
FACULTY_VERIFICATION_CHOICES = [
    ('none', 'None'),           # never uploaded / not applicable
    ('pending', 'Pending'),     # uploaded, awaiting admin review
    ('approved', 'Approved'),   # admin approved
    ('rejected', 'Rejected'),   # admin rejected, can re-upload
]
faculty_verification_status = models.CharField(
    max_length=10,
    choices=FACULTY_VERIFICATION_CHOICES,
    default='none',
)
```

This requires a migration: `python manage.py makemigrations && python manage.py migrate`

---

### Backend: Extraction Trigger

#### [MODIFY] [extraction_manager.py](file:///home/sheer/Desktop/SchedScan/backend/api/utils/extraction_manager.py)

After a successful faculty extraction (`job.upload_type == 'faculty'`), do two things:
1. If the user's `user_type` is not already `'faculty'`, set it to `'faculty'` (auto-promote)
2. Set `faculty_verification_status = 'pending'` (unless already `'approved'`)
3. Then notify admins (existing logic, but fix the guard condition)

Change the condition from:
```python
if job.upload_type == 'faculty' and not getattr(job.user, 'is_verified', True):
```
to:
```python
if job.upload_type == 'faculty':
    _handle_faculty_upload_verification(job)
```

New helper `_handle_faculty_upload_verification(job)`:
- Ensure `user.user_type = 'faculty'`
- If `user.faculty_verification_status` is `'none'` or `'rejected'`, set it to `'pending'`
- If status became `'pending'`, notify admins

---

### Backend: Pending Verifications Views

#### [MODIFY] [admin_views.py](file:///home/sheer/Desktop/SchedScan/backend/api/views/admin_views.py)

**`AdminPendingVerificationsView.get()`** — Change the query to use `faculty_verification_status='pending'`:
```python
qs = User.objects.filter(
    faculty_verification_status='pending',
    is_superuser=False,
).order_by('-created_at')
```
This is simpler and more accurate — no need for the Schedule subquery.

**`AdminPendingVerificationApproveView.post()`** — Also set:
```python
user.faculty_verification_status = 'approved'
user.is_verified = True
user.user_type = 'faculty'  # ensure this is set
user.save(update_fields=['faculty_verification_status', 'is_verified', 'user_type', 'updated_at'])
```

**`AdminPendingVerificationRejectView.post()`** — Set:
```python
user.faculty_verification_status = 'rejected'
user.save(update_fields=['faculty_verification_status', 'updated_at'])
```
This removes them from the pending query immediately.

---

### Frontend Admin: FacultyVerificationScreen

#### [MODIFY] [FacultyVerificationScreen.jsx](file:///home/sheer/Desktop/SchedScan/admin/src/screens/FacultyVerificationScreen.jsx)

After `confirmReject` succeeds, call `fetchPending()` (already done). Since the backend now updates `faculty_verification_status='rejected'`, the user will no longer appear in the list on re-fetch. No frontend change needed here — the existing `fetchPending()` call handles it.

---

### No Other Frontend Changes Needed

The admin dashboard `api.js`, `UsersScreen.jsx`, and `RejectFacultyModal.jsx` are already correct. The mobile notification types were fixed in the previous commit.

## Verification Plan

### Automated
```bash
cd backend && source venv/bin/activate
python manage.py makemigrations
python manage.py migrate
python manage.py check
```

### Manual Testing Workflow
1. Register a new user (as `student` — the default)
2. Upload a faculty schedule via the mobile app
3. Verify the user appears in admin's Pending Verifications
4. Reject the user → verify they disappear from the queue
5. Re-upload → verify they reappear as pending
6. Approve → verify they disappear and `is_verified=True`
