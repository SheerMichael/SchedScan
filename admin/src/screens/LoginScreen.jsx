import { useNavigate } from "react-router-dom";
import logoImg from '../assets/logo.png';

export default function LoginScreen({ onLogin }) {
  const navigate = useNavigate();

  const handleLogin = (e) => {
    e.preventDefault();
    onLogin();
    navigate("/");
  };

  return (
    // Applied your specific linear gradient to the whole screen
    <div className="min-h-screen flex flex-col bg-white">
      
      {/* Header section - matching your brand style */}
      <div className="bg-linear-to-r from-indigo-100 via-blue-50 to-amber-50 p-8 h-32 flex items-center">
        <div className="flex items-center gap-3">
          {/* Calendar Icon from your logo */}
          <div className="w-10 h-10 flex items-center justify-center">
             <img src={logoImg} alt="logo" className="w-full" />
          </div>
          <h1 className="text-3xl font-bold text-slate-700">SchedScan</h1>
        </div>
      </div>

      {/* Main Login Card Area */}
      <main className="grow flex items-center justify-center px-4 pb-20">
        <div className="w-full max-w-md">
          <div className="text-center mb-10">
            <h2 className="text-4xl font-bold text-slate-900 mb-3">Sign-in</h2>
            <p className="text-slate-500 font-medium">Please login to continue to your account.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email Input with the Blue Highlight Label */}
            <div className="relative">
              <label className="absolute -top-2.5 left-4 bg-white px-1 text-xs font-semibold text-blue-500 z-10">
                Email
              </label>
              <input
                type="email"
                placeholder="admin.schedscan@email.com"
                className="w-full px-4 py-3.5 bg-white border border-blue-400 rounded-xl focus:outline-none ring-offset-2 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Password Input */}
            <input
              type="password"
              placeholder="Password"
              className="w-full px-4 py-3.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-blue-400 transition-all"
            />

            {/* Checkbox */}
            <div className="flex items-center gap-2 px-1">
              <input 
                type="checkbox" 
                id="keep-logged" 
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" 
              />
              <label htmlFor="keep-logged" className="text-sm font-medium text-slate-600">
                Keep me logged in
              </label>
            </div>

            {/* Main Action Button */}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200"
            >
              Sign in
            </button>

            {/* Divider */}
            <div className="relative flex items-center py-2">
              <div className="grow border-t border-slate-200"></div>
              <span className="shrink mx-4 text-slate-400 text-sm font-medium">or</span>
              <div className="grow border-t border-slate-200"></div>
            </div>

            {/* Google Button */}
            <button
              type="button"
              className="w-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold py-3.5 rounded-xl flex items-center justify-center gap-3 transition-colors"
            >
              <img 
                src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/action/google.svg" 
                alt="Google" 
                className="w-5 h-5"
              />
              Sign in with Google
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}