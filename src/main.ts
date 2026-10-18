import './styles/global.css';
import { mountApp } from './ui/app';

const root = document.getElementById('app');
if (!root) throw new Error('#app 容器缺失');
mountApp(root);
