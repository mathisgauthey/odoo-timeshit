import {NamedRecord} from "./named-record.models";
import {Many2One} from "./many2one.model";

/** A task/ticket search result that also carries its parent project link. */
export interface LinkedRecord extends NamedRecord {
  project_id: Many2One;
}
