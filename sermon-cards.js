(() => {
    const config = window.AIC_SITE_CONFIG?.contentful;
    const supabaseConfig = window.AIC_SITE_CONFIG?.supabase;
    const sermonCache = new Map();
    let activeSource = '';

    function resolveAsset(field, assets) {
        const links = Array.isArray(field) ? field : [field];
        return links
            .filter(link => link?.sys?.id)
            .map(link => assets.find(asset => asset.sys.id === link.sys.id))
            .filter(Boolean);
    }

    function assetUrl(asset) {
        const url = asset?.fields?.file?.url;
        return url ? (url.startsWith('//') ? `https:${url}` : url) : '';
    }

    function safeMediaUrl(value) {
        if (!value) return '';
        try {
            const url = new URL(value, window.location.origin);
            const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname);
            return url.protocol === 'https:' || url.origin === window.location.origin || localHttp
                ? url.toString()
                : '';
        } catch {
            return '';
        }
    }

    function normalizeDate(value) {
        if (!value) return '';
        const raw = String(value);
        if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return '';
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Nairobi',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(parsed);
        const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
        return `${values.year}-${values.month}-${values.day}`;
    }

    function withAttachment(url) {
        if (!url) return '';
        const attachment = new URL(url);
        attachment.searchParams.set('fl', 'attachment');
        return attachment.toString();
    }

    function filenameForAsset(asset, fallback, contentType) {
        const fileName = asset?.fields?.file?.fileName || asset?.fields?.title || fallback;
        if (/\.[a-z0-9]{2,5}$/i.test(fileName)) return fileName;
        const extension = contentType.includes('pdf') ? '.pdf'
            : contentType.includes('powerpoint') ? '.pptx'
                : contentType.startsWith('audio/') ? '.mp3' : '';
        return `${fileName}${extension}`;
    }

    function mapSermons(data) {
        const assets = data.includes?.Asset || [];
        return (data.items || [])
            .map(item => {
                const fields = item.fields || {};
                const rawPresentationAssets = resolveAsset(fields.powerpoint || fields.files, assets)
                    .map(asset => ({
                        id: asset.sys.id,
                        url: withAttachment(assetUrl(asset)),
                        name: filenameForAsset(asset, 'sermon-resource', asset.fields?.file?.contentType || ''),
                        type: asset.fields?.file?.contentType || ''
                    }))
                    .filter(asset => asset.url);
                const pdfEntry = resolveAsset(fields.sermonPdf, assets)[0] ||
                    resolveAsset(fields.powerpoint || fields.files, assets)
                        .find(asset => (asset.fields?.file?.contentType || '').toLowerCase().includes('pdf'));
                const pdfAssetId = pdfEntry?.sys?.id;
                const presentationAssets = rawPresentationAssets.filter(asset =>
                    !pdfAssetId || asset.id !== pdfAssetId
                );
                const imageAsset = resolveAsset(fields.previewImage, assets)[0] ||
                    assets.find(asset => {
                        const contentType = asset.fields?.file?.contentType || '';
                        return contentType.startsWith('image/') &&
                            resolveAsset(fields.powerpoint || fields.files, assets).some(file => file.sys.id === asset.sys.id);
                    });
                const date = normalizeDate(fields.date);
                if (!date) console.warn('Sermon entry has no valid date and will be listed last:', item.sys?.id);
                if (!fields.title) console.warn('Sermon entry has no title and will not be displayed:', item.sys?.id);

                return {
                    id: item.sys?.id || '',
                    title: fields.title || '',
                    preacher: fields.preacher || '',
                    ministryTitle: fields.ministryTitle || fields.speakerTitle || '',
                    series: typeof fields.series === 'string' ? fields.series : '',
                    date,
                    updatedAt: item.sys?.updatedAt || '',
                    scriptureReference: fields.scriptureReference || fields.scripture || '',
                    previewImageUrl: safeMediaUrl(assetUrl(imageAsset)),
                    pdfUrl: safeMediaUrl(withAttachment(assetUrl(pdfAsset))),
                    pdfName: filenameForAsset(pdfAsset, 'sermon.pdf', pdfAsset?.fields?.file?.contentType || 'application/pdf'),
                    presentationAssets,
                    videoUrl: safeMediaUrl(fields.videoUrl || fields.youtubeUrl || ''),
                    audioUrl: safeMediaUrl(assetUrl(resolveAsset(fields.audio || fields.audioFile, assets)[0]))
                };
            })
            .filter(sermon => sermon.title)
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async function fetchContentfulSermons({limit = null} = {}) {
        if (!config?.spaceId || !config?.environment || !config?.deliveryToken) {
            throw new Error('Contentful sermon configuration is incomplete.');
        }

        const pageSize = limit ? Math.min(Number(limit), 100) : 100;
        const allItems = [];
        const assets = new Map();
        let skip = 0;
        let total = Infinity;
        while (skip < total && (!limit || allItems.length < limit)) {
            const params = new URLSearchParams({
                access_token: config.deliveryToken,
                content_type: 'sermons',
                include: '2',
                order: '-fields.date',
                limit: String(pageSize),
                skip: String(skip)
            });
            const response = await fetch(
                `https://cdn.contentful.com/spaces/${encodeURIComponent(config.spaceId)}/environments/${encodeURIComponent(config.environment)}/entries?${params}`
            );
            if (!response.ok) throw new Error(`Failed to load sermons: ${response.status} ${response.statusText}`);
            const page = await response.json();
            allItems.push(...(page.items || []));
            for (const asset of page.includes?.Asset || []) assets.set(asset.sys.id, asset);
            total = Number(page.total) || allItems.length;
            skip += pageSize;
        }
        const sermons = mapSermons({items: allItems, includes: {Asset: Array.from(assets.values())}});
        return limit ? sermons.slice(0, limit) : sermons;
    }

    function mapSupabaseSermons(rows) {
        return rows
            .filter(row => row && row.title)
            .map(row => {
                const isPremium = row.is_premium === true;
                const resourceUrl = !isPremium ? safeMediaUrl(row.resource_pack_url) : '';
                const fileType = resourceUrl && /\.pdf(?:$|[?#])/i.test(resourceUrl) ? 'application/pdf' : 'application/octet-stream';
                return {
                    id: row.id || '',
                    title: row.title || '',
                    preacher: row.preacher || '',
                    ministryTitle: '',
                    series: row.series || '',
                    date: normalizeDate(row.sermon_date),
                    updatedAt: row.created_at || '',
                    scriptureReference: row.scripture_reference || '',
                    previewImageUrl: '',
                    pdfUrl: fileType === 'application/pdf' ? resourceUrl : '',
                    pdfName: fileType === 'application/pdf' ? 'sermon.pdf' : '',
                    presentationAssets: resourceUrl && fileType !== 'application/pdf'
                        ? [{url: resourceUrl, name: 'Sermon resources', type: fileType}]
                        : [],
                    videoUrl: !isPremium ? safeMediaUrl(row.video_url) : '',
                    audioUrl: !isPremium ? safeMediaUrl(row.audio_url) : ''
                };
            })
            .sort((a, b) => (b.date || '').localeCompare(a.date || '') ||
                new Date(b.updatedAt) - new Date(a.updatedAt));
    }

    async function fetchSupabaseSermons({limit = null} = {}) {
        if (!supabaseConfig?.url || !supabaseConfig?.anonKey) {
            throw new Error('Supabase sermon fallback is not configured.');
        }

        const baseUrl = new URL(supabaseConfig.url);
        if (!['https:', 'http:'].includes(baseUrl.protocol)) {
            throw new Error('Supabase URL must use HTTP or HTTPS.');
        }
        const query = new URLSearchParams({
            select: 'id,title,preacher,scripture_reference,series,sermon_date,created_at,audio_url,video_url,resource_pack_url,is_premium',
            is_published: 'eq.true',
            order: 'sermon_date.desc',
            limit: String(limit ? Math.min(Number(limit), 100) : 100)
        });
        const response = await fetch(`${baseUrl.origin}/rest/v1/sermons?${query}`, {
            headers: {
                apikey: supabaseConfig.anonKey,
                Authorization: `Bearer ${supabaseConfig.anonKey}`,
                Accept: 'application/json'
            },
            signal: AbortSignal.timeout(10000)
        });
        if (!response.ok) {
            throw new Error(`Supabase sermon fallback returned HTTP ${response.status}.`);
        }
        const rows = await response.json();
        if (!Array.isArray(rows)) {
            throw new Error('Supabase sermon fallback returned an invalid response.');
        }
        return mapSupabaseSermons(rows).slice(0, limit || undefined);
    }

    async function fetchSermons({limit = null} = {}) {
        const cacheKey = limit ? `limit:${limit}` : 'archive';
        if (sermonCache.has(cacheKey)) return sermonCache.get(cacheKey);
        const service = await import('/assets/js/content/content-service.js');
        const records = await service.getContent('sermons', {limit});
        activeSource = service.getContentSource('sermons');
        const sermons = records.map(record => ({
            ...record,
            presentationAssets: record.files || record.presentationAssets || [],
            pdfName: record.pdfName || 'sermon.pdf'
        }));
        sermonCache.set(cacheKey, sermons);
        return sermons;
    }

    window.addEventListener('aic:content-updated', event => {
        if (event.detail?.type === 'sermons') sermonCache.clear();
    });

    function createCard(sermon, { onPreview, headingLevel = 3 } = {}) {
        const card = document.createElement('article');
        card.className = 'sermon-card';

        const preview = document.createElement('div');
        preview.className = 'sermon-preview';
        if (sermon.previewImageUrl) {
            const image = document.createElement('img');
            const imageUrl = new URL(sermon.previewImageUrl);
            imageUrl.searchParams.set('w', '640');
            imageUrl.searchParams.set('fm', 'webp');
            imageUrl.searchParams.set('q', '75');
            image.src = imageUrl.toString();
            image.alt = `${sermon.title} sermon preview`;
            image.loading = 'lazy';
            image.width = 640;
            image.height = 360;
            preview.appendChild(image);
        } else {
            const placeholder = document.createElement('div');
            placeholder.className = 'sermon-preview-placeholder';
            const icon = document.createElement('i');
            icon.className = 'fas fa-file-powerpoint';
            icon.setAttribute('aria-hidden', 'true');
            const hint = document.createElement('span');
            hint.textContent = 'Sermon preview image not yet added';
            placeholder.append(icon, hint);
            preview.appendChild(placeholder);
        }

        const title = document.createElement(`h${Math.min(6, Math.max(3, Number(headingLevel) || 3))}`);
        title.className = 'sermon-title-overlay';
        title.textContent = sermon.title;
        preview.appendChild(title);
        card.appendChild(preview);

        const content = document.createElement('div');
        content.className = 'sermon-content';
        const meta = document.createElement('div');
        meta.className = 'sermon-meta';

        const preacher = document.createElement('div');
        const preacherLabel = document.createElement('strong');
        preacherLabel.textContent = sermon.ministryTitle ? `Preacher · ${sermon.ministryTitle}` : 'Preacher';
        const preacherName = document.createElement('span');
        preacherName.textContent = sermon.preacher;
        if (sermon.preacher) preacher.append(preacherLabel, preacherName);

        const date = document.createElement('div');
        const dateLabel = document.createElement('strong');
        dateLabel.textContent = 'Date';
        const dateText = document.createElement('span');
        dateText.textContent = sermon.date ? new Date(`${sermon.date}T00:00:00Z`).toLocaleDateString('en-KE', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        }) : 'Date not provided';
        date.append(dateLabel, dateText);
        meta.append(preacher, date);
        content.appendChild(meta);

        if (sermon.scriptureReference) {
            const scripture = document.createElement('p');
            scripture.className = 'sermon-scripture-reference';
            scripture.textContent = `Scripture: ${sermon.scriptureReference}`;
            content.appendChild(scripture);
        }

        if (sermon.series) {
            const series = document.createElement('p');
            series.className = 'sermon-series';
            series.textContent = `Series: ${sermon.series}`;
            content.appendChild(series);
        }

        const actions = document.createElement('div');
        actions.className = 'sermon-actions';
        if (sermon.pdfUrl) {
            const previewButton = document.createElement('button');
            previewButton.type = 'button';
            previewButton.innerHTML = '<i class="fas fa-eye" aria-hidden="true"></i> Preview sermon';
            previewButton.addEventListener('click', () => {
                if (onPreview) onPreview(sermon.pdfUrl, sermon.title);
                else window.open(sermon.pdfUrl, '_blank', 'noopener,noreferrer');
            });
            actions.appendChild(previewButton);
        }

        const files = [
            ...(sermon.pdfUrl ? [{url: sermon.pdfUrl, name: sermon.pdfName, type: 'application/pdf'}] : []),
            ...sermon.presentationAssets
        ];
        files.forEach(file => {
            const download = document.createElement('a');
            download.className = 'sermon-download-link';
            download.href = file.url;
            download.target = '_blank';
            download.rel = 'noopener noreferrer';
            download.download = file.name;
            const icon = document.createElement('i');
            icon.className = 'fas fa-download';
            icon.setAttribute('aria-hidden', 'true');
            download.append(icon, document.createTextNode('Download'));
            actions.appendChild(download);
        });

        if (sermon.videoUrl) {
            const video = document.createElement('a');
            video.className = 'sermon-video-link';
            video.href = sermon.videoUrl;
            video.target = '_blank';
            video.rel = 'noopener noreferrer';
            video.innerHTML = '<i class="fab fa-youtube" aria-hidden="true"></i> Watch sermon';
            actions.appendChild(video);
        }

        if (sermon.audioUrl) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.preload = 'none';
            audio.src = sermon.audioUrl;
            audio.setAttribute('aria-label', `Listen to ${sermon.title}`);
            content.appendChild(audio);
        }

        if (new URLSearchParams(window.location.search).get('debugContent') === '1') {
            const badge = document.createElement('span');
            badge.className = 'sermon-source-badge';
            badge.textContent = sermon.source || activeSource || 'unknown';
            card.appendChild(badge);
        }

        if (!actions.children.length) {
            const unavailable = document.createElement('p');
            unavailable.className = 'sermon-files-unavailable';
            unavailable.textContent = 'Sermon resources will be available soon.';
            actions.appendChild(unavailable);
        }
        content.appendChild(actions);
        card.appendChild(content);
        return card;
    }

    async function render(container, {limit = null, onPreview, headingLevel = 3} = {}) {
        try {
            const sermons = await fetchSermons({limit});
            const displayed = sermons;
            container.replaceChildren();
            if (!displayed.length) {
                const empty = document.createElement('p');
                empty.className = 'sermon-empty';
                empty.textContent = 'No sermons are available yet. Please check back soon.';
                container.appendChild(empty);
                return sermons;
            }
            displayed.forEach(sermon => container.appendChild(createCard(sermon, {onPreview, headingLevel})));
            return sermons;
        } catch (error) {
            if (container.querySelector('.sermon-card')) {
                console.warn('Sermon refresh failed; keeping the pre-rendered sermons.', error);
                return [];
            }
            console.error('Failed to display sermons:', error);
            container.replaceChildren();
            const message = document.createElement('p');
            message.className = 'sermon-load-error';
            message.textContent = 'Sermons could not be loaded. Please try again later.';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.textContent = 'Retry';
            retry.addEventListener('click', async () => {
                sermonCache.clear();
                await render(container, {limit, onPreview, headingLevel});
            });
            container.append(message, retry);
            return [];
        }
    }

    window.AICSermonCards = {fetchSermons, createCard, render, getSource: () => activeSource};
})();
