import {Injectable} from '@angular/core';
import {BehaviorSubject} from "rxjs";

@Injectable({
  providedIn: 'root'
})
export class LoadingService {
  private pending = 0;
  private readonly loadingSubject = new BehaviorSubject<boolean>(false);

  loading$ = this.loadingSubject.asObservable();

  /**
   * Executes an asynchronous operation while managing a loading state.
   *
   * @param {function} operation A function that returns a promise to be executed.
   * @param {function} [onError] An optional error handler function that takes an error as input.
   *                              If provided, it will be called with the caught error. The return value of this function
   *                              (if any) will be returned by the method.
   * @return {Promise<T | undefined>} A promise that resolves with the result of the operation, or the value returned by the onError function if an error is caught and handled. Returns undefined in case of an unhandled error and if onError does not return a value.
   */
  async executeWithLoading<T>(
    operation: () => Promise<T>,
    onError?: (error: unknown) => T | void,
  ): Promise<T | undefined> {
    this.setLoading();
    try {
      return await operation();
    } catch (error) {
      if (onError) return onError(error) ?? undefined;
      throw error;
    } finally {
      this.unSetLoading();
    }
  }

  /**
   * Increments the pending operation count and updates the loading state.
   * If this is the first pending operation, it triggers an event to indicate loading has started.
   *
   * @return {void} Does not return a value.
   */
  setLoading() {
    this.pending++;
    if (this.pending === 1) this.loadingSubject.next(true);
  }

  /**
   * Decrements the pending count by 1, ensuring it does not go below 0.
   * If the pending count reaches 0, emits a `false` value to the `loadingSubject` to indicate that loading has stopped.
   *
   * @return {void} Does not return a value.
   */
  unSetLoading() {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) this.loadingSubject.next(false);
  }
}
