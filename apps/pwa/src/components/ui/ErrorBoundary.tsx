import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Trash2 } from "lucide-react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
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
            <Button variant="outline" onClick={() => {
                sessionStorage.clear();
                localStorage.clear();
                window.location.href = '/mantenimiento-planta/';
            }} className="gap-2 text-destructive hover:text-destructive">
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
