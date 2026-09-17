import { signOut } from '@certa/server/actions';
export default function Forbidden() { return <section className="card"><h1>Staff access required</h1><p>This account does not have access to the staff console.</p><form action={signOut}><button>Sign out</button></form></section>; }
