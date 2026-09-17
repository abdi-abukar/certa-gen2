import { AuthForm } from '../auth-form';
export default function Signup() { return <section className="card"><h1>Create your account</h1><p>Use a password of at least 12 characters.</p><AuthForm mode="signup" /><a href="/login">Already have an account? Sign in</a></section>; }
