import React from 'react';
import { RotateCcw } from 'lucide-react';

interface ViewportErrorBoundaryProps {
  children: React.ReactNode;
}

interface ViewportErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  retryKey: number;
}

export class ViewportErrorBoundary extends React.Component<
  ViewportErrorBoundaryProps,
  ViewportErrorBoundaryState
> {
  public state: ViewportErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
    retryKey: 0,
  };

  public static getDerivedStateFromError(
    error: unknown
  ): Partial<ViewportErrorBoundaryState> {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error ? error.message : 'WebGL 渲染上下文初始化异常',
    };
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      errorMessage: '',
      retryKey: prev.retryKey + 1,
    }));
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="viewport-error-fallback" role="alert">
          <div className="viewport-error-card">
            <span className="viewport-error-badge">WEBGL CONTEXT ERROR</span>
            <h2 className="viewport-error-title">3D 视口渲染器未能启动</h2>
            <p className="viewport-error-desc">
              当前浏览器或显卡驱动未能创建 WebGL 三维加速上下文（
              {this.state.errorMessage}
              ）。请确认浏览器硬件加速已开启后重试。
            </p>
            <button
              type="button"
              className="viewport-error-retry"
              onClick={this.handleRetry}
            >
              <RotateCcw size={14} />
              <span>重新初始化 3D 视口</span>
            </button>
          </div>
        </div>
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
