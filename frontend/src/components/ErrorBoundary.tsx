import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State { hasError: boolean }
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { hasError: false };
  static getDerivedStateFromError(): State { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="min-h-screen grid place-items-center bg-slate-50 p-6">
        <section className="max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">页面暂时不可用</h1>
          <p className="mt-2 text-slate-500">错误已被隔离，不会影响服务端账目。刷新后可继续操作。</p>
          <button onClick={() => window.location.reload()} className="mt-6 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
            <RefreshCw className="h-4 w-4" /> 刷新页面
          </button>
        </section>
      </main>
    );
  }
}
