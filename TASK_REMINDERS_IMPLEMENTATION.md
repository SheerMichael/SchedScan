# Task: Implement Dynamic Reminders Page with Real Course Data

## Objective
Transform the **Reminders page** (`frontend/schedscan/app/Home/reminders.tsx`) from using hardcoded placeholder data to dynamically displaying courses extracted from the user's uploaded COR documents.

## Current State Analysis

### What Currently Exists
- **File**: `frontend/schedscan/app/Home/reminders.tsx`
- **Current Behavior**: 
  - Shows hardcoded schedule data (3 days with "Software Engineering 1" courses)
  - Has a toggle `hasSchedules` state that switches between data view and empty state
  - Includes School Year/Semester selector (currently non-functional UI elements)
  - Groups courses by day (Monday, Tuesday, Thursday in example)
  - Each course shows: subject name, time range, edit button

### What's Wrong
1. **Hardcoded data**: The `scheduleData` array is static and doesn't reflect user's actual courses
2. **Missing API integration**: Not fetching courses from backend
3. **Day mapping issue**: Backend stores days as codes (M, T, W, TH, etc.), but UI needs full names (Monday, Tuesday, etc.)
4. **Empty state logic**: `hasSchedules` is manually set, should check if user has actual courses
5. **No loading state**: No indication while fetching data
6. **Multiple day courses**: Backend can have courses like "MW" (Monday/Wednesday) that should appear on multiple days

## Technical Requirements

### Data Source
- **API Endpoint**: `GET /api/courses/`
- **Authentication**: Required (automatically handled by `api.ts` interceptor)
- **Service**: Use `courseService.getCourses()` from `frontend/schedscan/services/courseService.ts`
- **Returns**: Array of Course objects

### Course Interface (from backend)
```typescript
interface Course {
  id: number;
  user: number;
  subject_code: string;      // e.g., "BSCS125781"
  subject_name: string;      // e.g., "SOFTWARE ENGINEERING"
  start_time: string;        // e.g., "07:00AM"
  end_time: string;          // e.g., "09:00AM"
  day: string;               // e.g., "M", "T", "W", "TH", "F", "S", "MW", "TTH", etc.
  location: string;          // e.g., "LR7", "LAB2"
  created_at: string;
  updated_at: string;
}
```

### Day Code Mappings (IMPORTANT!)

The backend stores days as abbreviated codes. You need to expand these:

```typescript
const dayCodeToFullName: Record<string, string> = {
  'M': 'Monday',
  'T': 'Tuesday',
  'W': 'Wednesday',
  'TH': 'Thursday',
  'F': 'Friday',
  'S': 'Saturday',
  'TF': 'Tuesday/Friday',
  'MW': 'Monday/Wednesday',
  'MWF': 'Monday/Wednesday/Friday',
  'MTH': 'Monday/Thursday',
  'TTH': 'Tuesday/Thursday'
};

// For courses with multiple days (e.g., "MW"), expand to individual days:
const expandDayCode = (dayCode: string): string[] => {
  const dayMap: Record<string, string[]> = {
    'M': ['Monday'],
    'T': ['Tuesday'],
    'W': ['Wednesday'],
    'TH': ['Thursday'],
    'F': ['Friday'],
    'S': ['Saturday'],
    'TF': ['Tuesday', 'Friday'],
    'MW': ['Monday', 'Wednesday'],
    'MWF': ['Monday', 'Wednesday', 'Friday'],
    'MTH': ['Monday', 'Thursday'],
    'TTH': ['Tuesday', 'Thursday']
  };
  return dayMap[dayCode] || [];
};
```

### Day Color Mapping (for UI consistency)
```typescript
const dayColors: Record<string, string> = {
  'Monday': 'bg-primary-500',      // Red
  'Tuesday': 'bg-primary-500',     // Red
  'Wednesday': 'bg-green-500',     // Green
  'Thursday': 'bg-blue-800',       // Blue
  'Friday': 'bg-yellow-500',       // Yellow
  'Saturday': 'bg-purple-500'      // Purple
};
```

## Implementation Steps

### Step 1: Import Required Dependencies
Add these imports to `reminders.tsx`:
```typescript
import { useEffect, useCallback } from 'react'; // Add to existing React import
import { useFocusEffect } from '@react-navigation/native'; // For reload on screen focus
import { useAuth } from '../../context/AuthContext'; // Get current user
import { courseService, Course } from '../../services/courseService'; // Fetch courses
import { ActivityIndicator, Alert } from 'react-native'; // Add to existing RN imports
```

### Step 2: Add State Management
Replace the hardcoded `scheduleData` with dynamic state:

```typescript
// Remove the hardcoded scheduleData array
// Add these state variables:
const { user } = useAuth(); // Get authenticated user
const [courses, setCourses] = useState<Course[]>([]);
const [isLoading, setIsLoading] = useState(true);
const [hasSchedules, setHasSchedules] = useState(false); // Will be set based on actual data
```

### Step 3: Create Data Transformation Function
Add this function to transform backend courses into the format needed by the UI:

```typescript
// Helper: Expand day codes to full names
const expandDayCode = (dayCode: string): string[] => {
  const dayMap: Record<string, string[]> = {
    'M': ['Monday'],
    'T': ['Tuesday'],
    'W': ['Wednesday'],
    'TH': ['Thursday'],
    'F': ['Friday'],
    'S': ['Saturday'],
    'TF': ['Tuesday', 'Friday'],
    'MW': ['Monday', 'Wednesday'],
    'MWF': ['Monday', 'Wednesday', 'Friday'],
    'MTH': ['Monday', 'Thursday'],
    'TTH': ['Tuesday', 'Thursday']
  };
  return dayMap[dayCode] || [];
};

// Transform courses into day-grouped schedule data
const transformCoursesToScheduleData = (courseList: Course[]) => {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayColors: Record<string, string> = {
    'Monday': 'bg-primary-500',
    'Tuesday': 'bg-primary-500',
    'Wednesday': 'bg-green-500',
    'Thursday': 'bg-blue-800',
    'Friday': 'bg-yellow-500',
    'Saturday': 'bg-purple-500'
  };

  // Group courses by day
  const coursesByDay: Record<string, any[]> = {};

  courseList.forEach((course) => {
    const days = expandDayCode(course.day);
    
    days.forEach((dayName) => {
      if (!coursesByDay[dayName]) {
        coursesByDay[dayName] = [];
      }
      
      coursesByDay[dayName].push({
        id: course.id,
        subject: course.subject_name || course.subject_code,
        start_time: course.start_time,
        end_time: course.end_time,
        day: course.day, // Keep original day code for reference
        location: course.location,
      });
    });
  });

  // Convert to array format expected by UI, maintaining day order
  return dayOrder
    .filter((day) => coursesByDay[day] && coursesByDay[day].length > 0)
    .map((day) => ({
      day,
      color: dayColors[day] || 'bg-gray-500',
      items: coursesByDay[day].sort((a, b) => {
        // Sort by start time
        return a.start_time.localeCompare(b.start_time);
      }),
    }));
};
```

### Step 4: Fetch Courses from Backend
Add this function to load courses:

```typescript
const loadCourses = useCallback(async () => {
  if (!user?.id) {
    setIsLoading(false);
    return;
  }

  try {
    setIsLoading(true);
    const fetchedCourses = await courseService.getCourses();
    setCourses(fetchedCourses);
    setHasSchedules(fetchedCourses.length > 0);
  } catch (error: any) {
    console.error('Error loading courses:', error);
    Alert.alert(
      'Error',
      'Failed to load courses. Please try again.',
      [{ text: 'OK' }]
    );
    setHasSchedules(false);
  } finally {
    setIsLoading(false);
  }
}, [user?.id]);
```

### Step 5: Load Data on Screen Focus
Replace the component logic to fetch data when screen appears:

```typescript
// Load courses when screen comes into focus
useFocusEffect(
  useCallback(() => {
    loadCourses();
  }, [loadCourses])
);
```

### Step 6: Update Render Logic
Replace the rendering section with:

```typescript
// Transform courses into schedule data
const scheduleData = transformCoursesToScheduleData(courses);

// Show loading spinner while fetching
if (isLoading) {
  return (
    <>
      <View className="w-full h-14 bg-white border-b-2 border-b-gray-200 justify-between items-center flex-row">
        {/* ... existing header code ... */}
      </View>
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" color="#DC2626" />
        <Text className="mt-4 text-gray-600">Loading courses...</Text>
      </View>
    </>
  );
}

// Rest of the render logic remains the same, but scheduleData is now dynamic
```

### Step 7: Handle Empty State
The empty state already exists, but ensure it shows when `hasSchedules` is false:

```typescript
{hasSchedules ? (
  <ScrollView className="flex-1 px-6" keyboardShouldPersistTaps="handled">
    {/* ... existing schedule display code ... */}
    
    {/* IMPORTANT: Use the transformed scheduleData */}
    <View>
      {scheduleData.map((day) => (
        <View key={day.day}>
          <DayHeader label={day.day} color={day.color} />
          {day.items.map((item) => (
            <ScheduleItem
              key={item.id}
              subject={item.subject}
              start_time={item.start_time}
              end_time={item.end_time}
              day={day.day}
              onEdit={() => onEdit({...item, day: day.day})}
            />
          ))}
        </View>
      ))}
    </View>
  </ScrollView>
) : (
  <View className='flex-1 justify-center items-center'>
    <Image 
      source={require('../../assets/images/Reminders.png')}
      style={{ width: 268, height: 168 }}
    />
    <Text className="text-gray-600 text-lg mt-4">No schedule, yet!</Text>
    <Text className="text-gray-500">Scan your schedule now</Text>
  </View>
)}
```

## Expected Behavior After Implementation

### ✅ When User Has Courses
1. Screen loads with loading spinner
2. Fetches courses from backend via `GET /api/courses/`
3. Groups courses by day (expanding multi-day codes like "MW" to appear on both Monday and Wednesday)
4. Displays days in order (Monday → Saturday)
5. Within each day, courses sorted by start time
6. Each course shows: subject name, time range (start - end), location
7. Edit button functional (already exists in `onEdit` function)

### ✅ When User Has No Courses
1. Screen loads with loading spinner
2. Fetches courses (empty array)
3. Shows empty state with:
   - Illustration image
   - "No schedule, yet!"
   - "Scan your schedule now"

### ✅ Error Handling
- Network error → Alert dialog with "Failed to load courses"
- Invalid token → Automatically refreshed by axios interceptor
- No user logged in → Shows empty state

## Important Notes

### Time Format Consistency
- Backend stores: `"07:00AM"`, `"09:00AM"`
- UI displays: `"7:00 AM - 8:30 AM"`
- You may need to format the time strings if backend format differs

### Course Subject Display
- Prioritize `subject_name` (e.g., "SOFTWARE ENGINEERING")
- Fallback to `subject_code` (e.g., "BSCS125781") if subject_name is empty

### Multiple Day Handling
- A course with `day: "MW"` should appear on BOTH Monday AND Wednesday sections
- Same course ID appears twice in UI but represents single database record

### Search Functionality (Future Enhancement)
- The search input exists in UI but is not functional yet
- For now, focus on displaying the courses correctly
- Search can be added later to filter by subject name/code

### School Year/Semester Selector (Future Enhancement)
- Currently just UI elements without backend filtering
- Backend doesn't store semester/year yet
- For now, display all user's courses regardless of semester

## Testing Checklist

After implementation, verify:
- [ ] Loading spinner appears while fetching
- [ ] Courses group correctly by day
- [ ] Multi-day courses (MW, TTH) appear on each respective day
- [ ] Days appear in correct order (Mon → Sat)
- [ ] Courses within a day sorted by time
- [ ] Empty state shows when no courses exist
- [ ] Edit button navigates correctly (already implemented)
- [ ] Screen reloads data when navigated back to (useFocusEffect)
- [ ] Works on both Android emulator and physical device
- [ ] No console errors or warnings

## Reference Files

Study these files for patterns:
- `frontend/schedscan/app/Home/home.tsx` - Shows how to fetch and display courses in calendar view
- `frontend/schedscan/app/Home/Schedules/student.tsx` - Shows how to use useFocusEffect and load schedules
- `frontend/schedscan/services/courseService.ts` - See getCourses() API call

## Common Pitfalls to Avoid

1. **Don't forget to expand multi-day codes** - "MW" must appear on both Monday and Wednesday
2. **Handle empty subject_name** - Use subject_code as fallback
3. **Sort courses by time** - Within each day, start time ascending
4. **Use useCallback for loadCourses** - Prevents infinite re-renders
5. **Check user authentication** - Verify `user?.id` exists before API calls
6. **Don't mutate state directly** - Always use setCourses([...])

## Expected File Changes

**Single file to modify**: `frontend/schedscan/app/Home/reminders.tsx`

**Changes**:
- Remove hardcoded `scheduleData` array
- Add imports: useAuth, courseService, useFocusEffect, ActivityIndicator
- Add state: courses, isLoading
- Add functions: expandDayCode, transformCoursesToScheduleData, loadCourses
- Add useEffect/useFocusEffect to load data
- Add loading state UI
- Make scheduleData dynamic based on transformed courses

**No other files need modification** - All required services and components already exist.

---

**Priority**: High  
**Estimated Complexity**: Medium  
**Dependencies**: None (all required code already exists)  
**Expected Time**: 30-60 minutes for experienced developer
