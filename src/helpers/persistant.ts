import { useEffect, useState } from "react";


export function usePersistentState<type>(key: string, defaultValue: type): [type, React.Dispatch<React.SetStateAction<type>>] {
  const stored = localStorage.getItem(key);
  const initial = stored ? JSON.parse(stored) as type : defaultValue;
  const [value, setValue] = useState<type>(initial);

  useEffect(() => {
    if (value === undefined)
      localStorage.removeItem(key)
    else
      localStorage.setItem(key, JSON.stringify(value ?? null));
  }, [key, value]);

  return [value, setValue];
}