const express = require('express');
const expressLayouts = require('express-ejs-layouts');
const bodyParser = require('body-parser');
const fs = require('fs').promises;
const session = require('express-session');
const mysql = require('mysql2');
const memoryStore = new session.MemoryStore();

const app = express();
const port = 6789;

app.use('/images', express.static('images'));

function isAdmin(req, res, next) {
    if (req.session && req.session.username && req.session.access_role == 1) {
        next();
    } else {
        res.status(403).send('Access Denied');
    }
}

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'ligia',
    port: 3306,
    multipleStatements: true,
    database: 'cumparaturi' 
});

db.connect(err => {
    if (err) {
        console.error('Error connecting to the database:', err);
        process.exit(1);
    }
    console.log('Connected to the database');
});

app.get('/creare-bd', (req, res) => {
    const sql = `
        CREATE DATABASE IF NOT EXISTS cumparaturi;
        USE cumparaturi;
        CREATE TABLE IF NOT EXISTS products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          price DECIMAL(10, 2) NOT NULL,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );    `;

    db.query(sql, (err, results) => {
        if (err) {
            console.error('Error executing query', err);
            res.status(500).send('Failed to create database or table.');
            return;
        }
        console.log('Database and table created or already exis t')
        res.redirect('/');
    });
});
  

app.get('/inserare-bd', (req, res) => {
    const products = [
        {
            'name': 'Cremă de alune',
            'price': 47.99,
            'description': 'Milka de la marmote',
            'sku': 'CA47'
        },
        {
            'name': 'Praline de ciocolată',
            'price': 123.49,
            'description': 'cadou de martisor',
            'sku': 'PC123'
        },
        {
            'name': 'Cutie de bomboane',
            'price': 75,
            'description': 'tot praline dar mai ieftine',
            'sku': 'CB75'
        },
        {
            'name': 'Fursecuri cu ciocolată',
            'price': 12,
            'description': 'Biscuiței ciocolatoși',
            'sku': 'FC12'
        }
    ];

    const skuCheckQuery = "SELECT sku FROM products WHERE sku IN (?)";
    const skus = products.map(p => p.sku);

    db.query(skuCheckQuery, [skus], (err, results) => {
        if (err) {
            console.error('Error executing SKU check query', err);
            res.status(500).send('Database error during SKU check.');
            return;
        }

        const existingSkus = new Set(results.map(row => row.sku));
        const filteredProducts = products.filter(p => !existingSkus.has(p.sku));

        if (filteredProducts.length === 0) {
            res.send('No new products to add; all SKUs already exist.');
            return;
        }

        const insertQueries = filteredProducts.map(product => {
            return `INSERT INTO products (name, price, description, sku) VALUES ('${product.name}', ${product.price}, '${product.description}', '${product.sku}')`;
        });

        const sql = insertQueries.join('; ');

        db.query(sql, (insertErr, insertResults) => {
            if (insertErr) {
                console.error('Error executing product insert query', insertErr);
                res.status(500).send('Failed to insert new products.');
                return;
            }
            console.log(`${insertResults.affectedRows} products inserted`);
            res.redirect('/');
        });
    });
});

app.use(session({
    secret: 'ligia',
    resave: false,
    saveUninitialized: false,
    store: memoryStore
}));

app.use(express.static('public'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(expressLayouts);


app.use((req, res, next) => {
    res.locals.session = req.session; 
    console.log('req.session:', req.session);
    console.log('req.session.username:', req.session.username);
    next();
});

app.use((req, res, next) => {
    console.log('req.session:', req.session);
    console.log('req.session.username:', req.session.username);
    res.locals.username = req.session.username || null;
    next();
});


async function startServer() {
    let quizData, users;
    try {
        quizData = JSON.parse(await fs.readFile('intrebari.json', 'utf8'));
        users = JSON.parse(await fs.readFile('utilizatori.json', 'utf8')); 
    } catch (err) {
        console.error('Error loading data files:', err);
        return;
    }


    app.get('/', (req, res) => {
        db.query('SELECT * FROM products', (err, products) => {
            if (err) {
                console.error('Error fetching products:', err);
                res.status(500).send('Failed to fetch products.');
                return;
            }
            res.render('index', { products, session: req.session });
        });
    });

    app.post('/adauga-cos', (req, res) => {
        const { productId, productName, productPrice } = req.body;
        if (!req.session.cart) {
            req.session.cart = [];
        }
        const existingProduct = req.session.cart.find((item) => item.id === productId);
    
        if (existingProduct) {
            existingProduct.quantity++;
        } else {
            req.session.cart.push({ id: productId, name: productName, price: parseFloat(productPrice), quantity: 1 });
        }
        req.session.message = `Product ${productName} was added to the cart!`; 
        res.redirect('/'); 
    });
    

    app.get('/vizualizare-cos', (req, res) => {
        res.render('vizualizare-cos', { session: req.session });

    });
    

    app.get('/autentificare', (req, res) => {
        res.render('autentificare', { session: req.session });
    });

    app.get('/chestionar', (req, res) => {
        res.render('chestionar', { intrebari: quizData });
    });

    app.post('/rezultat-chestionar', (req, res) => {
        const userAnswers = req.body;
        let score = 0;
        quizData.forEach((item, index) => {
            if (userAnswers[`intrebare_${index}`] == item.corect) {
                score++;
            }
        });
        res.render('rezultat-chestionar', {
            score: score,
            total: quizData.length
        });
    });

    app.get('/login', (req, res) => {
        res.render('autentificare');
    });

    app.get('/logout', (req, res) => {
        req.session.destroy(() => {
            res.redirect('/');
        });
    });

    app.post('/verificare-autentificare', (req, res) => {
        const { utilizator, parola } = req.body;
        db.query('SELECT * FROM users WHERE username = ? AND password = ?', [utilizator, parola], (err, results) => {
            if (err) {
                console.error('Database error during login:', err);
                res.status(500).send('Database error');
                return;
            }
            if (results.length > 0) {
                req.session.username = results[0].username;
                req.session.access_role = results[0].access_role;
                res.redirect('/');
            } else {
                res.render('autentificare', { error: 'Utilizator sau parola incorecte!' });
            }
        });
    });         //lab 12

    app.get('/admin-page', isAdmin, (req, res) => {
        res.render('admin-page');
    });

    app.post('/admin-add-product', isAdmin, (req, res) => {
        const { productName, productPrice, productDescription, productSKU } = req.body;
      
        const sql = 'INSERT INTO products (name, price, description, sku) VALUES (?, ?, ?, ?)';
        db.query(sql, [productName, productPrice, productDescription, productSKU], (err, result) => {
          if (err) {
            console.error('Error inserting product:', err);
            res.status(500).send('Failed to add new product.');
          } else {
            console.log('Product added successfully');
            res.redirect('/admin-page');
          }
        });
    });     //lab 12


    app.listen(port, () => console.log(`Serverul rulează la adresa http://localhost:${port}`));
}

startServer();
