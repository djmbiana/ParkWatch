// Standard JSON envelope helpers so every endpoint returns a consistent shape.

const sendSuccess = (res, data = null, message = 'Success', statusCode = 200) => {
  const body = { success: true, message };
  if (data !== null) body.data = data;
  return res.status(statusCode).json(body);
};

const sendCreated = (res, data = null, message = 'Created successfully') => {
  return sendSuccess(res, data, message, 201);
};

const sendError = (res, message = 'An error occurred', statusCode = 500) => {
  return res.status(statusCode).json({ success: false, message });
};

const sendPaginated = (res, data, total, page, limit) => {
  return res.status(200).json({
    success: true,
    message: 'Success',
    data,
    pagination: {
      total,
      page: parseInt(page, 10),
      limit: parseInt(limit, 10),
      totalPages: Math.ceil(total / limit),
    },
  });
};

module.exports = { sendSuccess, sendCreated, sendError, sendPaginated };
