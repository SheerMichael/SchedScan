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
    <div className="min-h-screen flex flex-col bg-slate-50 font-sans antialiased text-slate-900">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logoImg} alt="SchedScan Logo" className="w-8 h-8 object-contain" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-primary-700 leading-none">SchedScan</span>
            <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">University Portal</span>
          </div>
        </div>
      </header>

      <main className="grow flex items-center justify-center p-6">
        <div className="w-full max-w-110">
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200 overflow-hidden">
            <div className="p-8 sm:p-10">
              <div className="mb-10">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Login</h2>
              </div>

              <form onSubmit={handleLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-2 ml-1">
                    Email
                  </label>
                  <input
                    type="email"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-800/20 focus:border-primary-700 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2 ml-1">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      Password
                    </label>
                  </div>
                  <input
                    type="password"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-800/20 focus:border-primary-700 transition-all"
                  />
                </div>

                <div className="flex items-center gap-3 px-1">
                  <input 
                    type="checkbox" 
                    id="keep-logged" 
                    className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-primary-600 accent-primary-700" 
                  />
                  <label htmlFor="keep-logged" className="text-sm font-medium text-slate-600 select-none">
                    Remember this device
                  </label>
                </div>

                <button
                  type="submit"
                  className="w-full bg-primary-700 hover:bg-primary-800 text-white font-bold py-3.5 rounded-lg transition-all shadow-md shadow-red-200 active:transform active:scale-[0.98]"
                >
                  Login
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