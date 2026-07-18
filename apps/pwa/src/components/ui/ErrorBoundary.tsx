import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { LoadingScreen } from "@/components/ui/spinner";
import { AlertTriangle, RefreshCcw, Trash2 } from "lucide-react";
import { logger } from "@/lib/logger";
import {
  canAutoRecover,
  hardResetApp,
  isChunkLoadError,
  recoverFromChunkError,
} from "@/utils/chunkRecovery";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  // Chunk viejo tras deploy y hay recarga automática en curso →
  // mostrar pantalla de actualización en vez de la de error
  recovering: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    recovering: false
  };

  public static getDerivedStateFromError(error: Error): State {
    // Decidir acá (antes del primer render del fallback) si vamos a
    // auto-recargar, para no mostrar ni un frame de la pantalla de error
    return {
      hasError: true,
      error,
      recovering: isChunkLoadError(error) && canAutoRecover()
    };
  }

  public componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    logger.error('Uncaught error', error instanceof Error ? error : new Error(String(error)));

    // Chunks con hash viejo tras un deploy (GitHub Pages cachea index.html
    // 600s y los chunks anteriores desaparecen): recargar en vez de error
    if (isChunkLoadError(error)) {
      if (recoverFromChunkError()) return;
      // Reintentos agotados u offline: caer a la pantalla de error normal
      if (this.state.recovering) this.setState({ recovering: false });
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.state.recovering) {
        return <LoadingScreen message="Nueva versión detectada, actualizando…" />;
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex bg-background h-screen w-full flex-col items-center justify-center gap-4 p-4 text-center">
          <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
            <AlertTriangle className="h-10 w-10" />
          </div>
          <h1 className="text-2xl font-bold">Algo salió mal</h1>
          <p className="text-muted-foreground w-full max-w-md">
            La aplicación ha encontrado un error inesperado al renderizar.
          </p>

          <div className="bg-muted p-4 rounded text-xs font-mono text-left w-full max-w-lg overflow-auto max-h-48 border border-border">
            {this.state.error?.message || this.state.error?.toString()}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mt-4">
            <Button onClick={() => window.location.reload()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Recargar página
            </Button>
            <Button variant="outline" onClick={() => { void hardResetApp() }} className="gap-2 text-destructive hover:text-destructive">
              <Trash2 className="h-4 w-4" />
              Borrar datos locales y reiniciar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-8">
            Si el problema persiste, por favor contacta al soporte técnico.
          </p>
        </div>
      );
    }

    return this.props.children;
  }
}
