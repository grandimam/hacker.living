import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export const formatDate = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date));
export const controlClass = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';
export const buttonClass = cn(controlClass, 'inline-flex min-h-10 items-center justify-center gap-2 rounded-[3px] border border-accent bg-accent px-4 py-2.5 text-xs font-medium text-white transition-colors hover:border-[#c83b07] hover:bg-[#c83b07] disabled:cursor-wait disabled:opacity-50');
export const secondaryClass = cn(buttonClass, 'border-rule bg-paper text-ink hover:border-accent hover:bg-accent-soft hover:text-accent');
export const textLinkClass = cn(controlClass, 'inline-flex items-center gap-2 text-xs font-semibold text-accent underline-offset-4 hover:underline');
