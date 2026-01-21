'use client';

/**
 * SecuritySettings - Container for all security-related settings
 */

import MFASetup from './MFASetup';
import AccountDangerZone from './AccountDangerZone';

export default function SecuritySettings() {
  return (
    <div className="p-6">
      <MFASetup />
      <AccountDangerZone />
    </div>
  );
}
