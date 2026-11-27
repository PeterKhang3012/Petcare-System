declare module 'swagger-ui-dist/swagger-ui-bundle.js' {
  interface Options {
    domNode: HTMLElement;
    urls: { name: string; url: string }[];
    presets: unknown[];
    plugins: unknown[];
    layout: string;
    validatorUrl: null;
    persistAuthorization: boolean;
    deepLinking: boolean;
  }
  const SwaggerUI: {
    (options: Options): void;
    presets: { apis: unknown };
  };
  export default SwaggerUI;
}
declare module 'swagger-ui-dist/swagger-ui-standalone-preset.js' {
  const preset: unknown;
  export default preset;
}
