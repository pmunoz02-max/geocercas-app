export default async function handler(req, res) {
  return res.status(410).json({
    error: "Endpoint deprecated",
    message: "Reports endpoint retired. Remove client calls before deleting.",
  });
}
