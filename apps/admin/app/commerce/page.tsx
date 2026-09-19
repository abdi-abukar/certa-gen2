import {requireStaff} from '@certa/server/auth';
import Commerce from './commerce';
export default async function CommercePage(){await requireStaff();return <Commerce/>;}
