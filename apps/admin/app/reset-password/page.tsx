import { requireStaff } from '@certa/server/auth';
import { AuthForm } from '../auth-form';
export default async function Reset() { await requireStaff(); return <section className="card"><h1>Choose a new password</h1><AuthForm mode="reset" /></section>; }
