import Joi, { Root } from 'joi';
import { semver, semverRange, SemverSchema, SemverRangeSchema } from 'joi-extension-semver';
export default Joi.extend(semver).extend(semverRange) as Root & SemverSchema & SemverRangeSchema;