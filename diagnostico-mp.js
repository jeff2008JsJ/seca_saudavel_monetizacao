require("dotenv").config();
const id = "dc66cfdac45d4b7ea5b87bf8967fb5f9";

fetch("https://api.mercadopago.com/preapproval/" + id, {
  headers: {
    Authorization: "Bearer " + process.env.MP_ACCESS_TOKEN
  }
})
.then(async response => {
  const body = await response.text();
  console.log("HTTP:", response.status);
  console.log("Resposta:", body);
})
.catch(error => console.log("Erro:", error.message));
