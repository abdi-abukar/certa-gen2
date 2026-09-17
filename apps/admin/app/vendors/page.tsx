import { requireStaff } from '@certa/server/auth';
import { vendors, checkVendorHealth } from '@certa/server/vendors';
import './vendors.css';
export default async function VendorsPage() {
  await requireStaff();
  const checks = await Promise.all(vendors.map(vendor => checkVendorHealth(vendor.id)));
  return <section className="vendors"><p className="eyebrow">Operations</p><h1>Vendors</h1>
    <p>Current service checks and integration readiness. Results are reused for up to 60 seconds; no background polling runs from this page.</p>
    <a className="button" href="/vendors">Refresh checks</a>
    <div className="vendor-grid">{vendors.map((vendor, index) => {
      const health = checks[index]!;
      return <article className="card" key={vendor.id}><p className="eyebrow">{vendor.lifecycle}</p><h2>{vendor.name}</h2><p>{vendor.purpose}</p>
        <strong className={health.status === 'healthy' ? '' : 'error'}>{health.status.replaceAll('_', ' ')}</strong>
        <p>{health.detail}</p><p>{vendor.scope}</p>
        <dl><dt>Read probe</dt><dd><code>{vendor.probe}</code></dd><dt>Last check</dt><dd><time dateTime={health.checkedAt}>{health.checkedAt}</time> · {health.latencyMs} ms</dd></dl>
        <a href={vendor.healthEndpoint}>View health endpoint</a></article>;
    })}</div><p>Uptime history is not collected yet. A successful probe does not prove every vendor feature works. Cloudflare Access is a deployment gate and still needs deployment verification.</p>
  </section>;
}
