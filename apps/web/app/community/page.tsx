import './community.css';
import { requireIdentity } from '@certa/server/auth';
import { Community } from './community';
export default async function Page(){const user=await requireIdentity();return <Community key={user.id}/>;}
