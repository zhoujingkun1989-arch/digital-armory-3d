import React from 'react';
import { AlertTriangle, Gauge, LayoutGrid, RotateCcw } from 'lucide-react';
import type { LanguageCode } from '../narration/types';
import { useAppStore } from '../store/useAppStore';

export type ViewportFailureKind = 'webgl' | 'runtime';

const WEBGL_FAILURE_RE =
  /webgl|context|gl_|gpu|shader|canvas|lostcontext|extension|three|out of memory|oom|framebuffer|texture/i;

export function classifyViewportError(error: unknown): ViewportFailureKind {
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : typeof error === 'string'
        ? error
        : '';
  if (!message.trim()) return 'webgl';
  return WEBGL_FAILURE_RE.test(message) ? 'webgl' : 'runtime';
}

export const VIEWPORT_RECOVERY_STRINGS: Readonly<
  Record<
    LanguageCode,
    {
      webglBadge: string;
      runtimeBadge: string;
      webglTitle: string;
      runtimeTitle: string;
      webglDesc: string;
      runtimeDesc: string;
      defaultWebglMessage: string;
      diagnosticLabel: string;
      currentQualityLabel: string;
      reloadBtn: string;
      ecoRetryBtn: string;
      returnVaultBtn: string;
      recoveryTip: string;
    }
  >
> = {
  zh: {
    webglBadge: 'WEBGL GPU 渲染故障',
    runtimeBadge: '3D 场景渲染异常',
    webglTitle: '3D WebGL 视口未能启动或上下文已丢失',
    runtimeTitle: '3D 视口遇到场景渲染异常',
    webglDesc:
      '当前浏览器或显卡驱动未能创建或保持硬件加速 WebGL 2.0 上下文。建议切换至「节能画质」降低显存占用后重试，或直接重新加载视口。',
    runtimeDesc:
      '当前三维展品组件在渲染期间抛出了运行时异常。你可以立即重试加载当前视口、切换节能画质安全重启，或返回 34 展位兵器库选择其他展品。',
    defaultWebglMessage: 'WebGL 2.0 渲染上下文初始化失败',
    diagnosticLabel: '诊断信息',
    currentQualityLabel: '当前画质档位',
    reloadBtn: '重新加载 3D 视口',
    ecoRetryBtn: '切换节能画质重试',
    returnVaultBtn: '返回兵器库',
    recoveryTip: '提示：切换节能画质会关闭高分辨率阴影与后处理，以保障集成显卡和移动端流畅运行。',
  },
  en: {
    webglBadge: 'WEBGL GPU FAILURE',
    runtimeBadge: '3D RENDER EXCEPTION',
    webglTitle: '3D WebGL Viewport Context Unavailable',
    runtimeTitle: '3D Viewport Encountered a Render Exception',
    webglDesc:
      'Your browser or GPU driver could not initialize or retain a hardware-accelerated WebGL 2.0 context. Drop to Eco Graphics to reduce VRAM load and retry, or reload the viewport.',
    runtimeDesc:
      'The active 3D exhibit scene threw a runtime render exception. You can reload the viewport immediately, drop to Eco Graphics for a safe restart, or return to the 34-Bay Vault.',
    defaultWebglMessage: 'WebGL 2.0 rendering context failed to initialize',
    diagnosticLabel: 'Diagnostic',
    currentQualityLabel: 'Active Tier',
    reloadBtn: 'Reload 3D Viewport',
    ecoRetryBtn: 'Drop to Eco Graphics & Retry',
    returnVaultBtn: 'Return to 34-Bay Vault',
    recoveryTip:
      'Tip: Eco Graphics disables heavy post-processing and ultra shadow maps for resilient GPU recovery.',
  },
};

export interface ViewportRecoveryFallbackViewProps {
  lang: LanguageCode;
  failureKind: ViewportFailureKind;
  errorMessage: string;
  currentQuality: string;
  onReload: () => void;
  onEcoRetry: () => void;
  onReturnVault: () => void;
}

export const ViewportRecoveryFallbackView: React.FC<
  ViewportRecoveryFallbackViewProps
> = ({
  lang,
  failureKind,
  errorMessage,
  currentQuality,
  onReload,
  onEcoRetry,
  onReturnVault,
}) => {
  const ui = VIEWPORT_RECOVERY_STRINGS[lang];
  const isWebgl = failureKind === 'webgl';
  const badgeText = isWebgl ? ui.webglBadge : ui.runtimeBadge;
  const titleText = isWebgl ? ui.webglTitle : ui.runtimeTitle;
  const descText = isWebgl ? ui.webglDesc : ui.runtimeDesc;

  return (
    <div
      className="viewport-error-fallback"
      data-testid="viewport-error-fallback"
      data-failure-kind={failureKind}
      role="alert"
      aria-live="assertive"
    >
      <div
        className="viewport-error-card"
        style={{
          maxWidth: 520,
          width: 'min(520px, 100%)',
          padding: '26px 28px',
          backdropFilter: 'blur(18px)',
          WebkitBackdropFilter: 'blur(18px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span
          className="viewport-error-badge"
          data-testid="viewport-error-kind-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 2,
            border: isWebgl
              ? '1px solid rgba(248, 113, 113, 0.36)'
              : '1px solid rgba(251, 191, 36, 0.42)',
            background: isWebgl
              ? 'rgba(220, 38, 38, 0.14)'
              : 'rgba(245, 158, 11, 0.14)',
            color: isWebgl ? '#f87171' : '#fbbf24',
          }}
        >
          <AlertTriangle size={12} aria-hidden="true" />
          <span>{badgeText}</span>
        </span>

        <h2 className="viewport-error-title" style={{ margin: 0, fontSize: 17 }}>
          {titleText}
        </h2>

        <p
          className="viewport-error-desc"
          style={{ margin: 0, maxWidth: 460 }}
        >
          {descText}
        </p>

        <div
          style={{
            width: '100%',
            padding: '8px 11px',
            borderRadius: 9,
            border: '1px solid var(--border-subtle, rgba(148, 163, 184, 0.22))',
            background: 'var(--surface-subtle, rgba(15, 23, 42, 0.56))',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            textAlign: 'left',
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            wordBreak: 'break-word',
          }}
        >
          <span>
            <strong>{ui.diagnosticLabel}:</strong>{' '}
            {errorMessage || ui.defaultWebglMessage}
          </span>
          <span style={{ opacity: 0.78 }}>
            <strong>{ui.currentQualityLabel}:</strong>{' '}
            {currentQuality.toUpperCase()}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            marginTop: 6,
          }}
        >
          <button
            type="button"
            className="viewport-error-retry"
            data-testid="viewport-retry-btn"
            onClick={onReload}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{ui.reloadBtn}</span>
          </button>

          <button
            type="button"
            data-testid="viewport-eco-retry-btn"
            onClick={onEcoRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 9,
              border: '1px solid rgba(52, 211, 153, 0.5)',
              background: 'rgba(16, 185, 129, 0.18)',
              color: '#34d399',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <Gauge size={14} aria-hidden="true" />
            <span>{ui.ecoRetryBtn}</span>
          </button>

          <button
            type="button"
            data-testid="viewport-vault-btn"
            onClick={onReturnVault}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              borderRadius: 9,
              border: '1px solid var(--border-strong, rgba(148, 163, 184, 0.34))',
              background: 'var(--surface-pill, rgba(15, 23, 42, 0.65))',
              color: 'var(--color-text-primary)',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <LayoutGrid size={14} aria-hidden="true" />
            <span>{ui.returnVaultBtn}</span>
          </button>
        </div>

        <p
          style={{
            margin: '2px 0 0',
            fontSize: 11,
            lineHeight: 1.45,
            color: 'var(--color-text-muted)',
          }}
        >
          {ui.recoveryTip}
        </p>
      </div>
    </div>
  );
};

interface ViewportErrorBoundaryProps {
  children: React.ReactNode;
  initialError?: unknown;
}

interface ViewportErrorBoundaryState {
  hasError: boolean;
  failureKind: ViewportFailureKind;
  errorMessage: string;
  retryKey: number;
}

export class ViewportErrorBoundary extends React.Component<
  ViewportErrorBoundaryProps,
  ViewportErrorBoundaryState
> {
  public constructor(props: ViewportErrorBoundaryProps) {
    super(props);
    if (props.initialError !== undefined) {
      const lang = useAppStore.getState().lang;
      this.state = {
        hasError: true,
        failureKind: classifyViewportError(props.initialError),
        errorMessage:
          props.initialError instanceof Error
            ? props.initialError.message
            : typeof props.initialError === 'string'
              ? props.initialError
              : VIEWPORT_RECOVERY_STRINGS[lang].defaultWebglMessage,
        retryKey: 0,
      };
    } else {
      this.state = {
        hasError: false,
        failureKind: 'webgl',
        errorMessage: '',
        retryKey: 0,
      };
    }
  }

  public static getDerivedStateFromError(
    error: unknown
  ): Partial<ViewportErrorBoundaryState> {
    const lang = useAppStore.getState().lang;
    return {
      hasError: true,
      failureKind: classifyViewportError(error),
      errorMessage:
        error instanceof Error
          ? error.message
          : typeof error === 'string' && error.trim().length > 0
            ? error
            : VIEWPORT_RECOVERY_STRINGS[lang].defaultWebglMessage,
    };
  }

  private handleRetry = (): void => {
    this.setState((prev) => ({
      hasError: false,
      failureKind: 'webgl',
      errorMessage: '',
      retryKey: prev.retryKey + 1,
    }));
  };

  private handleEcoRetry = (): void => {
    useAppStore.getState().setGraphicsQuality('eco', true);
    this.setState((prev) => ({
      hasError: false,
      failureKind: 'webgl',
      errorMessage: '',
      retryKey: prev.retryKey + 1,
    }));
  };

  private handleReturnToVault = (): void => {
    useAppStore.getState().returnToArmory();
    this.setState((prev) => ({
      hasError: false,
      failureKind: 'webgl',
      errorMessage: '',
      retryKey: prev.retryKey + 1,
    }));
  };

  public render(): React.ReactNode {
    if (this.state.hasError) {
      const state = useAppStore.getState();
      return (
        <ViewportRecoveryFallbackView
          lang={state.lang}
          failureKind={this.state.failureKind}
          errorMessage={this.state.errorMessage}
          currentQuality={state.graphicsQuality}
          onReload={this.handleRetry}
          onEcoRetry={this.handleEcoRetry}
          onReturnVault={this.handleReturnToVault}
        />
      );
    }

    return (
      <React.Fragment key={this.state.retryKey}>
        {this.props.children}
      </React.Fragment>
    );
  }
}
