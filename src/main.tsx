import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { AppProvider } from './context';
import { Layout } from './components/Layout';
import { Places } from './pages/Places';
import { About, Credits, NotFound, Saved } from './pages/Other';

const Fonts = lazy(() => import('./pages/Fonts'));

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AppProvider><Routes><Route element={<Layout/>}><Route index element={<Places/>}/><Route path="places" element={<Places/>}/><Route path="places/:placeId" element={<Places/>}/><Route path="fonts" element={<Suspense fallback={<p className="py-12 text-sm text-muted">Loading fonts…</p>}><Fonts/></Suspense>}/><Route path="saved" element={<Saved/>}/><Route path="about" element={<About/>}/><Route path="credits" element={<Credits/>}/><Route path="pipeline/fonts" element={<Navigate to="/fonts" replace/>}/><Route path="pipeline" element={<Navigate to="/places" replace/>}/><Route path="*" element={<NotFound/>}/></Route></Routes></AppProvider></BrowserRouter></StrictMode>);
