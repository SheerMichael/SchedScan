import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import logoImg from '../assets/logo.png';
import { useAuth } from "../context/AuthContext";

export default function LoginScreen() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg("");

    if (!email.trim() || !password) {
      setErrorMsg("Please enter your email and password.");
      return;
    }

    setIsLoading(true);
    const result = await login(email.trim().toLowerCase(), password, rememberDevice);
    setIsLoading(false);

    if (result.success) {
      navigate("/", { replace: true });
    } else {
      setErrorMsg(result.message || "Login failed.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="SchedScan Logo" className="w-8 h-8 object-contain" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-primary-700 leading-none">SchedScan</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Admin Portal</span>
          </div>
        </div>
      </header>

      <main className="grow flex items-center justify-center p-6">
        <div className="w-full max-w-110">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 overflow-hidden">
            <div className="p-8 sm:p-10">
              <div className="mb-10">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Admin Login</h2>
                <p className="mt-2 text-sm text-slate-500">Sign in with your administrator credentials.</p>
              </div>

              {/* Error banner */}
              {errorMsg && (
                <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm font-medium text-red-700">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-6" noValidate>
                <div>
                  <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 ml-1">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-800/20 focus:border-primary-700 transition-all placeholder:text-slate-400 disabled:opacity-50"
                    placeholder="admin@schedscan.app"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 ml-1">
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-800/20 focus:border-primary-700 transition-all disabled:opacity-50"
                  />
                </div>

                <div className="flex items-center gap-3 px-1">
                  <input
                    type="checkbox"
                    id="keep-logged"
                    checked={rememberDevice}
                    onChange={(e) => setRememberDevice(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-primary-600 accent-primary-700"
                  />
                  <label htmlFor="keep-logged" className="text-sm font-medium text-slate-600 select-none">
                    Remember this device
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-primary-700 hover:bg-primary-800 text-white font-bold py-3.5 rounded-lg transition-all shadow-md shadow-red-200 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 right-0 opacity-[0.03] pointer-events-none">
        <img src={logoImg} alt="" className="w-96 h-96 -mr-20 -mb-20 grayscale" />
      </div>
    </div>
  );
}