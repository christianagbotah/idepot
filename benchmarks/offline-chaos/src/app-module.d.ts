/** The compiled api app module ships without declarations (the api build
 *  has declaration:false); the chaos runner only needs the runtime class. */
declare module '*/apps/api/dist/app.module.js' {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  export const AppModule: any;
}
