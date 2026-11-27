import { useEffect, useRef } from 'react';
import SwaggerUI from 'swagger-ui-dist/swagger-ui-bundle.js';
import SwaggerUIStandalonePreset from 'swagger-ui-dist/swagger-ui-standalone-preset.js';
import 'swagger-ui-dist/swagger-ui.css';
import { ApiVisibilityPlugin } from './apiVisibility';

const services = ['Auth', 'Pet', 'Booking', 'Catalog', 'Care', 'Payment'];

export default function ApiDocs() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = root.current;
    if (!target) return;
    SwaggerUI({
      domNode: target,
      urls: services.map(name => ({ name, url: '/docs-api/' + name.toLowerCase() })),
      presets: [SwaggerUI.presets.apis, SwaggerUIStandalonePreset],
      plugins: [ApiVisibilityPlugin],
      layout: 'StandaloneLayout',
      validatorUrl: null,
      persistAuthorization: false,
      deepLinking: true,
    });
    return () => { target.replaceChildren(); };
  }, []);
  return <div ref={root} />;
}
