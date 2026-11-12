/**
 * Base class for errors defined by Stelaro.
 *
 * @category Errors
 */
export abstract class StelaroError extends Error {
    /**
     * Create a Stelaro error.
     */
    protected constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = new.target.name;
    }
}
