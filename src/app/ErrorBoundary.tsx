// The app's last line: a render error anywhere shows one red line instead of a blank page, and is reported (Sentry,
// when it is set up). The report goes through onError so Sentry's code never has to load before the first screen.
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: unknown, componentStack: string) => void;
}

interface ErrorBoundaryState {
  failed: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    this.props.onError(error, info.componentStack ?? '');
  }

  override render(): ReactNode {
    if (this.state.failed) return <p className="p-6 text-sm text-danger">Something broke. Reload the page to try again.</p>;
    return this.props.children;
  }
}
