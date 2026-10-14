#!/usr/bin/env python3
import os
import zipfile
import shutil

def create_dist_zip():
    dist_dir = 'dist'
    api_dir = 'api'
    zip_name = 'dist.zip'
    
    # Clean up any existing zip
    if os.path.exists(zip_name):
        try:
            os.remove(zip_name)
        except Exception:
            pass
    
    # Ensure public/.htaccess is copied to dist/ if not already there
    if os.path.exists('public/.htaccess') and os.path.exists(dist_dir):
        shutil.copy2('public/.htaccess', os.path.join(dist_dir, '.htaccess'))

    # Ensure the true 404 page is shipped. It is referenced by the .htaccess
    # ErrorDocument directive and must land at the deploy root, alongside it.
    if os.path.exists('public/404.html') and os.path.exists(dist_dir):
        shutil.copy2('public/404.html', os.path.join(dist_dir, '404.html'))

    print(f"Creating compact {zip_name} (target: ~7MB)...")
    
    # Excluded files and directories to keep the shared-host deployment lightweight.
    excluded_files = {'.DS_Store', 'Thumbs.db'}
    excluded_dirs = {'__pycache__', '.git', 'node_modules', 'vendor', '.github', 'tests'}

    def is_runtime_artifact(file_path):
        """api/storage holds transient, admin-staged preview PDFs (customer
        reports waiting to be emailed). They must never ship in a deployment
        zip - only the folder's .htaccess guards should."""
        normalized = file_path.replace(os.sep, '/')
        basename = os.path.basename(normalized)
        # Never ship the fallback HMAC signing key or an interrupted atomic-write
        # temp file, even when an ignored local runtime key exists in the checkout.
        if basename.startswith('app_secret_key.txt'):
            return True
        if '/storage/' not in normalized:
            return False
        return not basename.startswith('.ht')

    with zipfile.ZipFile(zip_name, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
        # 1. Add all optimized static frontend files from dist/ to root of zip
        if os.path.exists(dist_dir):
            for root, dirs, files in os.walk(dist_dir):
                # Filter out excluded directories and Vite 6+ .vite/ cache
                dirs[:] = [d for d in dirs if d not in excluded_dirs and not d.startswith('.')]
                for file in files:
                    file_path = os.path.join(root, file)
                    if file in excluded_files or file.endswith('.map'):
                        continue
                    if file.endswith('.cjs'):
                        raise RuntimeError(f'Unexpected executable server bundle in static cPanel deployment: {file_path}')
                    arcname = os.path.relpath(file_path, dist_dir)
                    zipf.write(file_path, arcname)
                    
        # 2. Add complete PHP backend API
        if os.path.exists(api_dir):
            for root, dirs, files in os.walk(api_dir):
                dirs[:] = [d for d in dirs if d not in excluded_dirs]
                for file in files:
                    file_path = os.path.join(root, file)
                    if file in excluded_files or file.endswith('.map'):
                        continue
                    if file.endswith('.cjs'):
                        raise RuntimeError(f'Unexpected executable server bundle in static cPanel deployment: {file_path}')
                    if is_runtime_artifact(file_path):
                        continue
                    arcname = os.path.relpath(file_path, '.')
                    zipf.write(file_path, arcname)

        # The PHP report needs the same ceremony-specific weekday / season
        # rules as the browser, including when deployed from this zip alone.
        rules_path = 'src/lib/muhurtham/rules.json'
        if os.path.exists(rules_path):
            zipf.write(rules_path, rules_path)

        # Local source-based astrologer knowledge base (guided questions,
        # life-area rules, remedies, guardrails, report sections, and Tamil
        # source registry). Shipped at root knowledge/ for full dist.zip
        # extraction (and mirrored in api/knowledge/ for api/-only uploads).
        knowledge_dir = 'knowledge'
        if os.path.exists(knowledge_dir):
            for root, dirs, files in os.walk(knowledge_dir):
                dirs[:] = [d for d in dirs if d not in excluded_dirs and d != 'ingest']
                for file in files:
                    file_path = os.path.join(root, file)
                    if file in excluded_files or file.endswith(('.map', '.cjs', '.py')):
                        continue
                    arcname = os.path.relpath(file_path, '.')
                    zipf.write(file_path, arcname)

        # 3. Add root .htaccess if dist didn't contain it
        if os.path.exists('public/.htaccess') and '.htaccess' not in zipf.namelist():
            zipf.write('public/.htaccess', '.htaccess')

        # 4. Add the operator documentation referenced by the deployment guide.
        #    The runbooks live under docs/ in the repository and now ship under
        #    docs/ in the zip too, keeping the deploy root clean.
        for doc in (
            'BIGROCK_CPANEL_DEPLOYMENT_GUIDE.md',
            'RATE_LIMITING_AND_PAYMENT_RECOVERY.md',
            'PDF_DELIVERY_QUALITY.md',
            'HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md',
            'PAYMENT_WEBHOOK_IDEMPOTENCY_AND_CI.md'
        ):
            source = os.path.join('docs', doc)
            if os.path.exists(source):
                zipf.write(source, os.path.join('docs', doc))

        # 5. Ops scripts the runbook schedules from cron (weekly backup, weekly
        #    log rotation). They must ship with the release: a host that is
        #    deployed by extracting this zip has no git checkout to copy them
        #    from, and the cron entries in HEALTH_MONITORING_AND_BACKUP_VERIFICATION.md
        #    point at these paths. Both are .sh / .md, which public/.htaccess
        #    already refuses to serve over HTTP.
        for ops_dir in ('scripts/backup', 'scripts/ops'):
            if not os.path.isdir(ops_dir):
                continue
            for root, dirs, files in os.walk(ops_dir):
                dirs[:] = [d for d in dirs if d not in excluded_dirs]
                for file in files:
                    if file in excluded_files or file.endswith(('.map', '.cjs', '.pyc')):
                        continue
                    file_path = os.path.join(root, file)
                    zipf.write(file_path, os.path.relpath(file_path, '.'))

    size_mb = os.path.getsize(zip_name) / (1024 * 1024)
    print(f"Successfully generated {zip_name} - Size: {size_mb:.2f} MB")

# ---------------------------------------------------------------------------
# Deployment shape contract (audit S1): the cPanel file manager must keep
# showing a limited folder list at the site root — never one folder per route
# or per asset class. These lists are deliberately explicit: if a build change
# grows them, the packer FAILS instead of silently shipping a sprawled tree.
# Enforced by tests/dist-shape.test.ts and asserted again in CI's zip check.
# ---------------------------------------------------------------------------
EXPECTED_DIST_TOP_DIRS = {'assets', 'audio', 'video-scenes'}
EXPECTED_ZIP_TOP_DIRS = {'api', 'assets', 'audio', 'docs', 'knowledge', 'scripts', 'src', 'video-scenes'}


def assert_deploy_shape(dist_dir='dist', zip_name='dist.zip'):
    if os.path.isdir(dist_dir):
        # Vite 6+ creates a .vite/ cache directory inside dist/ — filter it out
        # since it is a build artifact, not a deployment folder.
        dist_dirs = {e for e in os.listdir(dist_dir) if os.path.isdir(os.path.join(dist_dir, e)) and not e.startswith('.')}
        if dist_dirs != EXPECTED_DIST_TOP_DIRS:
            raise RuntimeError(
                f'dist/ top-level folders changed: {sorted(dist_dirs)} (expected {sorted(EXPECTED_DIST_TOP_DIRS)})'
            )
    with zipfile.ZipFile(zip_name) as archive:
        zip_dirs = {name.split('/', 1)[0] for name in archive.namelist() if '/' in name}
    if zip_dirs != EXPECTED_ZIP_TOP_DIRS:
        raise RuntimeError(
            f'dist.zip top-level folders changed: {sorted(zip_dirs)} (expected {sorted(EXPECTED_ZIP_TOP_DIRS)})'
        )
    print(f'Deploy shape OK — zip root folders: {", ".join(sorted(zip_dirs))}')

if __name__ == '__main__':
    create_dist_zip()
    assert_deploy_shape()
