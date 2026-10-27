# AIC Egerton Chapel Website

Static, multi-page website for AIC Egerton Chapel. The pages share a common responsive navigation and footer, with styles in `site-chrome.css`.

## Pages

- `index.html` — landing page, hero carousel, upcoming events, recent sermons, and map
- `about.html` — church background, leadership, and gallery
- `Ministries.html` — ministry details and WhatsApp application form
- `sermons.html` — sermon listings and filters
- `contact form.html` — contact form

## Run locally

Open `index.html` in a browser, or serve this folder with any static web server. The site has no local package installation or build step.

## Deploy to Netlify

The Netlify configuration publishes the current folder directly. Set the Netlify publish directory to the project root and leave the build command empty. Keep the referenced HTML, images, `site-chrome.css`, `_headers`, and `sitemap.xml` in the published directory.

## Shared navigation and footer

Keep the header navigation and footer markup consistent across all five HTML pages. The shared `site-chrome.css` file controls their responsive layout, colors, typography, and spacing. Update the same shared elements on each page when changing navigation links, church contact details, service times, social links, or the map.

The current-page navigation link should have `aria-current="page"` as well as the `active` class. The menu button's `aria-expanded` value should track whether the mobile navigation is open.

## Upcoming events

The landing page renders event objects from `window.upcomingEvents` and displays an empty-state message when the array is empty. A future CMS integration can set the array and call `renderUpcomingEvents(window.upcomingEvents)`.

Each event uses this shape:

```js
{
  title: "Event title",
  date: "Event date",
  time: "Event time",
  description: "Short event description",
  flyer: "path-or-cms-url-to-flyer",
  flyerAlt: "Accessible description of the flyer"
}
```

Only add events with confirmed dates and details. The “Remind Me” link opens WhatsApp with a prefilled message; visitors still need to send it.

## Forms and donations

The ministry form opens WhatsApp with the application details for the visitor to review and send. The donation action requests current details through WhatsApp; it does not process a payment. The contact form uses the existing EmailJS setup, which should be tested after changes to its provider settings or message template.

## Site metadata

Update the canonical URL, structured data, `robots.txt`, and `sitemap.xml` if the production domain or page URLs change. Keep structured data in the HTML `<head>` so search engines can discover it.
