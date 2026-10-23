const { unprocessable } = require('../utils/httpError');

// Parses req[source] with a zod schema. On failure -> HTTP 422 with field names.
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source] ?? {});
    if (!result.success) {
      const fields = result.error.issues.map((i) => ({
        field: i.path.join('.') || '(body)',
        message: i.message,
      }));
      throw unprocessable('Validation failed', fields);
    }
    req.valid = result.data;
    next();
  };
}

module.exports = { validate };
