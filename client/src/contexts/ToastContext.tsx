import { createContext, useContext, useState, type ReactNode } from 'react';
const Context = createContext<(message: string, type?: 'success' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null);
  function show(message: string, type: 'success' | 'error' = 'success') {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 4500);
  }
  return (
    <Context.Provider value={show}>
      {children}
      {toast && (
        <div role="status" className={'toast ' + toast.type}>
          {toast.message}
        </div>
      )}
    </Context.Provider>
  );
}
export const useToast = () => useContext(Context);
