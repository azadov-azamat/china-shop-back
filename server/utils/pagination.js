function pagination(limit, offset, totalCount) {
  let totalPages = Math.ceil(totalCount / limit);
  let currentPage = Math.ceil(offset / limit) + 1;
  return { totalPages, currentPage, totalCount, perPage: limit };
}

module.exports = pagination;
