import {requireStaff} from '@certa/server/auth';
import {AwardsConsole} from './console';
import './awards.css';
export default async function Page(){const user=await requireStaff();return <AwardsConsole key={user.id}/>;}
