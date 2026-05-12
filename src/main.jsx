import ReactDOM from 'react-dom/client';
import { clearAquariumDebugStorageIfRequested } from './debug/aquariumRecovery.js';
import App from './App.jsx';
import './index.css';

clearAquariumDebugStorageIfRequested();

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
