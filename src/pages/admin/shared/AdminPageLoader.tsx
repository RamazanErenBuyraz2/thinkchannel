export function AdminPageLoader() {
  return (
    <div className="admin-page-loader" role="status" aria-label="Sayfa yükleniyor">
      <span className="admin-page-loader__spinner" aria-hidden="true" />
      <span>Sayfa yükleniyor...</span>
    </div>
  )
}
