import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// 应用挂载。strictMode 在开发期帮助发现副作用问题。
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
