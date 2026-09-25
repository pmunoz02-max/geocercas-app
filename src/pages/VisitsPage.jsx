import React from 'react';
import {useAuthSafe} from '@/context/auth.js';
import VisitsPanel from '../components/VisitsPanel';
export default function VisitsPage(){const auth=useAuthSafe();const org=auth.currentOrgId||auth.currentOrg?.id||auth.orgId;return <VisitsPanel key={org} orgId={org} identityUser={auth.user?.id}/>;}
