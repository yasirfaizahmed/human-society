import './ui/styles.css';
import { App } from './ui/app';
import { openSetup } from './ui/setup';

try {
  const saved = localStorage.getItem('hs-theme');
  if (saved === 'dark' || saved === 'light') document.documentElement.setAttribute('data-theme', saved);
} catch {
  /* storage unavailable: follow the system theme */
}

const root = document.getElementById('root')!;
const app = new App(root);
openSetup(document.body, null, (scenario) => app.start(scenario), null);
