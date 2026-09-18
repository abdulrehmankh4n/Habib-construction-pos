import { useState } from 'react';
import { useSettings, useAuth } from '../../lib/auth';
import { PageHeader, Spinner, Tabs } from '../../components/ui';
import { ShopTab, SalesTaxTab } from './ShopTab';
import { ReceiptTab } from './ReceiptTab';
import { AgreementSettingsTab, FbrTab, NotificationsTab } from './IntegrationsTab';
import { AuditTab, BackupTab, NumberingTab } from './SystemTab';

type Tab = 'shop' | 'sales' | 'receipt' | 'notifications' | 'agreement' | 'fbr' | 'numbering' | 'backup' | 'audit';

export function SettingsPage() {
  const { can } = useAuth();
  const settings = useSettings();
  const manage = can('settings.manage');
  const [tab, setTab] = useState<Tab>(manage ? 'shop' : can('backup.manage') ? 'backup' : 'audit');

  const tabs = [
    ...(manage
      ? ([
          { value: 'shop', label: 'Shop profile' },
          { value: 'sales', label: 'Tax & selling rules' },
          { value: 'receipt', label: 'Receipts & quotations' },
          { value: 'notifications', label: 'WhatsApp & SMS' },
          { value: 'agreement', label: 'Agreements & Zakat' },
          { value: 'fbr', label: 'FBR integration' },
          { value: 'numbering', label: 'Numbering' },
        ] as { value: Tab; label: string }[])
      : []),
    ...(can('backup.manage') ? ([{ value: 'backup', label: 'Backup' }] as { value: Tab; label: string }[]) : []),
    ...(can('audit.view') ? ([{ value: 'audit', label: 'Activity log' }] as { value: Tab; label: string }[]) : []),
  ];

  if (settings.isLoading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Settings" subtitle="Shop details, tax, printing, integrations, backups and activity log" />
      <Tabs value={tab} onChange={setTab} tabs={tabs} />
      {tab === 'shop' && <ShopTab settings={settings.data} />}
      {tab === 'sales' && <SalesTaxTab settings={settings.data} />}
      {tab === 'receipt' && <ReceiptTab settings={settings.data} />}
      {tab === 'notifications' && <NotificationsTab settings={settings.data} />}
      {tab === 'agreement' && <AgreementSettingsTab settings={settings.data} />}
      {tab === 'fbr' && <FbrTab settings={settings.data} />}
      {tab === 'numbering' && <NumberingTab />}
      {tab === 'backup' && <BackupTab settings={settings.data} />}
      {tab === 'audit' && <AuditTab />}
    </div>
  );
}
