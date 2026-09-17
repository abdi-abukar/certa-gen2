import { AuthForm } from '../auth-form';
export default function Recover() { return <section className="card"><h1>Reset your password</h1><p>We will email you a link to choose a new password.</p><AuthForm mode="recover" /><a href="/login">Back to sign in</a></section>; }
