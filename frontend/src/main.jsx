import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom'; // ✅ Move BrowserRouter here
import AppRoutes from './routes/AppRoutes';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* <BrowserRouter> ✅ BrowserRouter at the TOP level */}
      <AppRoutes />
    {/* </BrowserRouter> */}
  </React.StrictMode>
);