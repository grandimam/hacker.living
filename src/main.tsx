import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { AppProvider } from './context';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Places } from './pages/Places';
import { About, ComingSoon, Credits, NotFound, Saved } from './pages/Other';

createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><AppProvider><Routes><Route element={<Layout/>}><Route index element={<Home/>}/><Route path="places" element={<Places/>}/><Route path="places/:placeId" element={<Places/>}/><Route path="saved" element={<Saved/>}/><Route path="about" element={<About/>}/><Route path="credits" element={<Credits/>}/><Route path="playgrounds" element={<ComingSoon kind="playgrounds"/>}/><Route path="fonts" element={<ComingSoon kind="fonts"/>}/><Route path="*" element={<NotFound/>}/></Route></Routes></AppProvider></BrowserRouter></StrictMode>);
