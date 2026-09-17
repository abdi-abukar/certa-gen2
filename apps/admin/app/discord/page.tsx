import './discord.css';
import { requireStaff } from '@certa/server/auth';
import { DiscordConsole } from './console';
export default async function Page(){const user=await requireStaff();return <DiscordConsole key={user.id}/>;}
