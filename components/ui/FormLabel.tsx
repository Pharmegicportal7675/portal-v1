import * as React from 'react';
import { clsx } from 'clsx';

interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
}

export function FormLabel({ children, required, className, ...props }: FormLabelProps) {
  return (
    <label
      className={clsx('text-xs font-semibold text-slate-700 uppercase tracking-wider', className)}
      {...props}
    >
      {children}
      {required ? <span className="text-rose-500 ml-0.5">*</span> : null}
    </label>
  );
}
