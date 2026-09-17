import {requireIdentity} from '@certa/server/auth';
import {Cabinet} from './cabinet';
export default async function Page(){const user=await requireIdentity();return <Cabinet key={user.id}/>;}
