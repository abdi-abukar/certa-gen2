import { AuthPage } from '../_components/auth-page';
export const metadata = { title: 'Reset your password' };
export default function Recover() { return <section className="card"><p className="eyebrow">Certa</p><h1>Reset your password.</h1><p>We will email you a link to choose a new password.</p><AuthPage mode="recover" /></section>; }
