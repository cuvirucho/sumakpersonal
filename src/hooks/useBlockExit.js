import { useEffect } from 'react';

// Bloquea la salida de la pantalla mientras `active` sea true:
// - Atrapa el botón "atrás" del navegador re-empujando una entrada en el historial.
// - Advierte al recargar o cerrar la pestaña.
// El router actual es <BrowserRouter> no-data, así que no hay useBlocker disponible;
// por eso se usa el patrón history/popstate.
export function useBlockExit(active) {
  useEffect(() => {
    if (!active) return;

    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
      return '';
    };

    const onPopState = () => {
      window.history.pushState(null, '', window.location.href);
    };

    window.history.pushState(null, '', window.location.href);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [active]);
}
