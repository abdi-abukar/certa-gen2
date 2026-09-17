import { AuthForm } from '../auth-form';
export default function Login() { return <section className="card"><h1>Sign in</h1><p>Welcome back to Certa.</p><AuthForm mode="login" /><div className="links"><a href="/forgot-password">Forgot password?</a><a href="/signup">Create an account</a></div></section>; }
